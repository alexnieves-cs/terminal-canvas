import * as Radix from '@radix-ui/react-dropdown-menu'
import { createContext, useContext, useEffect, useState, type JSX } from 'react'
import type { ReactNode, ComponentPropsWithoutRef } from 'react'
import { useOpenIntent, triggerProps, contentProps } from './useOpenIntent'
import type { OpenIntent } from './useOpenIntent'
import { INERT_PLACEMENT } from './popper'
import { MotionSurface } from './MotionSurface'

/**
 * THE MENU PRIMITIVE — Radix's behaviour under this app's existing markup.
 *
 * What it adds, on every surface that adopts it: roving arrow-key focus,
 * Home/End, typeahead, Escape, outside-pointer dismissal, focus returned to
 * the trigger, correct `menuitem` / `menuitemradio` / `menuitemcheckbox`
 * semantics, and `aria-expanded` / `data-state` kept in step with the open
 * flag. Most of those were hand-rolled once, in PanelFrame (M258), and absent
 * from every other menu in the app.
 *
 * What it deliberately does NOT add is a look. Every element here is the
 * caller's own — `asChild` throughout — so `.shell__view-menu`,
 * `.skills-pane__menu` and `.work-node__menu` keep their class, their data
 * attribute, their element type (`div` or `ul`) and their CSS placement. This
 * file names no token and no class, and the stylesheet gains nothing for it.
 *
 * Three settings are not negotiable and are stated once, here:
 *
 *   modal={false}   A modal Radix menu writes `pointer-events: none` onto
 *                   <body> and locks scrolling. On a canvas whose panels hold
 *                   live PTYs that is a frozen app, and the freeze outlives a
 *                   dropped close event.
 *   no <Portal>     The Electron suites address these surfaces as DESCENDANTS
 *                   of their owner — `.panel[data-panel-id="hdA"]
 *                   [data-panel-menu]` and friends, a dozen assertions in
 *                   verify-panels-product alone. Portalling to <body> keeps
 *                   the node in the document and breaks every one of them
 *                   without failing to render.
 *   INERT_PLACEMENT Floating UI is measuring a box that `display: contents`
 *                   deleted; see popper.ts for why the wrapper is neutralised.
 */

/**
 * The hand that opened this menu and the open flag itself, shared by the
 * trigger, the content and every row. Radix's Root renders no element, so the
 * provider that carries it adds no DOM and cannot disturb a flex row or a
 * stacking context.
 *
 * The open flag is here because the TRIGGER needs it: a synthesised click has
 * to toggle the menu itself (see triggerProps), and Radix exposes no way to do
 * that from inside the Trigger.
 */
interface MenuContext {
  readonly intent: OpenIntent
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onExitComplete: () => void
}

const Ctx = createContext<MenuContext | null>(null)

function useMenu(): MenuContext {
  const ctx = useContext(Ctx)
  if (ctx === null) throw new Error('a Menu part was rendered outside its Menu')
  return ctx
}

export interface MenuProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly children: ReactNode
}

export function Menu({ open, onOpenChange, children }: MenuProps): JSX.Element {
  const intent = useOpenIntent()
  // Keep Radix mounted for Motion's exit, then let it remove ordinary menus.
  // Force-mounted adopters retain their existing hidden-addressability after
  // this same exit has completed.
  const [mounted, setMounted] = useState(open)
  useEffect(() => { if (open) setMounted(true) }, [open])
  return (
    <Ctx.Provider value={{ intent, open, onOpenChange, onExitComplete: () => { if (!open) setMounted(false) } }}>
      <Radix.Root open={mounted} onOpenChange={onOpenChange} modal={false}>{children}</Radix.Root>
    </Ctx.Provider>
  )
}

/**
 * The caller's own trigger element, unchanged.
 *
 * `shellControl` must NOT also be spread on it. This mounts the same
 * mousedown-preventDefault itself, and it already owns the click — a second
 * onClick toggling `open` would race `triggerProps`' synthesised-click
 * fallback and leave the menu shut on every other press.
 */
export function MenuTrigger({ children, ...rest }: ComponentPropsWithoutRef<'button'>): JSX.Element {
  const { intent, open, onOpenChange } = useMenu()
  return (
    <Radix.Trigger asChild {...triggerProps(intent, () => onOpenChange(!open))}>
      <button type="button" {...rest}>{children}</button>
    </Radix.Trigger>
  )
}

export interface MenuContentProps extends ComponentPropsWithoutRef<'div'> {
  /** The caller's own element — a `div` for most menus, a `ul` for WorkNode's. */
  readonly children: ReactNode
  /**
   * KEEP THE CONTENT MOUNTED WHILE CLOSED, and hide it with the `hidden`
   * attribute the way the rest of this app does.
   *
   * Radix unmounts a closed menu. Some of these menus may not be unmounted,
   * because their ROWS are addressed from outside the menu: `.shell__merge`
   * lives in the View menu and is clicked directly — without opening View — by
   * verify-panels-agents, verify-panels-kinds and shot.cjs's `merged` golden.
   * Unmounting turns all of those into `querySelector(...) === null`, which
   * reads as the control having been deleted rather than hidden.
   *
   * It is also what keeps verify:styles `hidden.1` honest: that check DERIVES
   * its list from every `hidden=` in the renderer's JSX, so a class that stops
   * being toggled that way quietly leaves the set it guards.
   *
   * An adopter passing this owns the `hidden` attribute on its own element.
   */
  readonly forceMount?: true
}

export function MenuContent({ children, forceMount, ...rest }: MenuContentProps): JSX.Element {
  const { intent, open, onExitComplete } = useMenu()
  // THE GESTURE THAT OPENS A FORCE-MOUNTED MENU MUST NOT ALSO DISMISS IT.
  //
  // Radix keeps MenuContentImpl — and with it a live DismissableLayer —
  // mounted whenever `forceMount` is set, open or not. Normally a closed menu
  // has no layer at all, so the pointerdown that opens it is seen by nobody.
  // Here the layer is already listening, and the trigger is outside the
  // content: Radix's trigger opens the menu and the layer dismisses it in the
  // same press, so a real click appears to do nothing whatsoever.
  //
  // `sawPointer` is the discriminator, and it must be a REF read at event
  // time. The obvious guard — only while `open` is false — does not work:
  // pointerdown is a DISCRETE event, so React flushes the opening state update
  // synchronously before the document-level listeners run, and a guard
  // conditioned on render-time state is already gone by the time the layer
  // asks. The ref is set on the trigger's own pointerdown and spent on the
  // click that follows, so it is true for exactly the one gesture that opened
  // this menu and false for every genuine press elsewhere — which still
  // dismisses, as it should.
  //
  // None of this shows up under a synthesised `click`: no pointerdown means no
  // outside interaction, which is why verify-panels-agents stayed green and
  // only verify-panels-shell's real `clickAt` on the inspector's ⋯ caught it.
  const guard = forceMount === true
    ? { onInteractOutside: (event: { preventDefault: () => void }) => { if (intent.sawPointer.current) event.preventDefault() } }
    : {}
  return (
    <Radix.Content
      {...INERT_PLACEMENT}
      asChild
      forceMount={forceMount}
      {...guard}
      {...contentProps(intent)}
      // The canvas reads a bare mousedown on the shell as a background click
      // and deselects; every hand-rolled menu here already stopped that, and
      // the primitive keeps it rather than making each call site remember.
      onMouseDown={(event) => event.stopPropagation()}
      {...rest}
    >
      <MotionSurface open={open} onExitComplete={onExitComplete}>{children}</MotionSurface>
    </Radix.Content>
  )
}

/**
 * Radix focuses a menu row when the pointer moves over it, so the keyboard
 * follows the mouse. Under a POINTER-opened menu that drags focus out of
 * xterm's hidden textarea on a mere hover — shell-control.ts's exact defect,
 * arriving through a library rather than a call site. Preventing the default
 * makes Radix's composed handler skip its `item.focus()`. When a KEY opened
 * the menu, focus is already inside it and the hover-follow is left alone.
 */
function holdFocus(intent: OpenIntent): { onPointerMove: (event: { preventDefault: () => void }) => void } {
  return { onPointerMove: (event) => { if (intent.byPointer.current) event.preventDefault() } }
}

export interface MenuItemProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onSelect'> {
  /**
   * Runs on click AND on Enter/Space, after which Radix closes the menu.
   *
   * The event is passed for the one case that must NOT close: a row that arms
   * on the first press and acts on the second, like the inspector's Close.
   * `event.preventDefault()` keeps the menu standing so the second press has
   * somewhere to land — without it the surface disappears between the two and
   * the verb can never be completed.
   */
  readonly onSelect?: (event: { preventDefault: () => void }) => void
  readonly disabled?: boolean
  readonly children: ReactNode
}

/**
 * One row. `onSelect` replaces the call site's `shellControl(...)`: Radix runs
 * the action on click AND on Enter/Space, then closes the menu — which the
 * hand-rolled rows each did with their own trailing `setOpen(false)`.
 *
 * `disabled` is passed twice on purpose. Radix needs it to skip the row in the
 * roving order and typeahead; the `<button>` needs it so the row is genuinely
 * inert and `button:not(:disabled)` — the selector the Electron suites walk
 * menus with — keeps meaning what it meant.
 */
export function MenuItem({ onSelect, disabled, children, ...rest }: MenuItemProps): JSX.Element {
  const { intent } = useMenu()
  return (
    <Radix.Item asChild disabled={disabled} onSelect={(event) => onSelect?.(event)} {...holdFocus(intent)}>
      <button type="button" disabled={disabled} {...rest}>{children}</button>
    </Radix.Item>
  )
}

export interface MenuCheckboxItemProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onSelect'> {
  readonly checked: boolean
  readonly onSelect?: () => void
  readonly children: ReactNode
}

/** `role="menuitemcheckbox"` and `aria-checked`, both supplied by Radix. */
export function MenuCheckboxItem({ checked, onSelect, children, ...rest }: MenuCheckboxItemProps): JSX.Element {
  const { intent } = useMenu()
  return (
    <Radix.CheckboxItem asChild checked={checked} onSelect={() => onSelect?.()} {...holdFocus(intent)}>
      <button type="button" {...rest}>{children}</button>
    </Radix.CheckboxItem>
  )
}

export interface MenuRadioGroupProps {
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly children: ReactNode
}

/**
 * A set of mutually exclusive rows. Radix needs the group to own the value, so
 * this renders one `role="group"` div around them.
 *
 * That div is layout-safe ONLY because the menus it is used in are block
 * containers — `.shell__view-menu` declares no `display`, so its rows stack as
 * blocks whether or not a div sits between. Do not reach for it inside a menu
 * whose rule IS a flex column (`.inspector__menu`, `.work-node__menu`): there
 * the wrapper would collapse every row into a single flex item and eat the
 * gap. Use MenuCheckboxItem, which adds no element, in those.
 */
export function MenuRadioGroup({ value, onValueChange, children }: MenuRadioGroupProps): JSX.Element {
  return <Radix.RadioGroup value={value} onValueChange={onValueChange} asChild><div role="group">{children}</div></Radix.RadioGroup>
}

export interface MenuRadioItemProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onSelect' | 'value'> {
  readonly value: string
  readonly children: ReactNode
}

/** `role="menuitemradio"` and `aria-checked`, both supplied by Radix. */
export function MenuRadioItem({ value, children, ...rest }: MenuRadioItemProps): JSX.Element {
  const { intent } = useMenu()
  return (
    <Radix.RadioItem asChild value={value} {...holdFocus(intent)}>
      <button type="button" {...rest}>{children}</button>
    </Radix.RadioItem>
  )
}
