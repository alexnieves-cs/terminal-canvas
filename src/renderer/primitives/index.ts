/**
 * HEADLESS PRIMITIVES — Radix's behaviour under this app's own markup.
 *
 * The rule for everything in this folder: it supplies BEHAVIOUR and
 * ACCESSIBILITY, never a look. No file here names a class, a token or a
 * colour; every element is the caller's own through `asChild`, so a surface
 * that adopts a primitive keeps its class, its data attribute, its element
 * type and its CSS placement, and the stylesheet does not learn that Radix
 * exists. The one exception is documented in popper.ts and is a single
 * token-free declaration.
 *
 * Which primitive a surface wants:
 *
 *   Menu      a list of COMMANDS. Rows answer to the arrow keys, Home/End and
 *             typeahead, and announce as menuitem / menuitemradio /
 *             menuitemcheckbox.
 *   Popover   a transient surface of ARBITRARY content — prose, links, a verb
 *             per row. Walked with Tab, not the arrows.
 *   Dialog    a surface that may OWN the window. The only one Radix does not
 *             position, and the only one with a focus trap.
 *   Tooltip   a hint richer than a `title` can carry. Shipped unadopted; see
 *             Tooltip.tsx for why `title=` is still the right default here.
 *
 * Two constraints bind every one of them, and both fail silently if broken:
 * nothing is `modal` by default, because a modal Radix layer writes
 * `pointer-events: none` onto <body> and freezes a canvas full of live PTYs;
 * and nothing is portalled, because the Electron suites address these surfaces
 * as descendants of their owner.
 */
export { Menu, MenuTrigger, MenuContent, MenuItem, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem } from './Menu'
export type { MenuProps, MenuContentProps, MenuItemProps, MenuCheckboxItemProps, MenuRadioGroupProps, MenuRadioItemProps } from './Menu'

export { Popover, PopoverTrigger, PopoverContent } from './Popover'
export type { PopoverProps, PopoverContentProps } from './Popover'

export { Dialog, DialogTrigger, DialogContent, DialogOverlay, DialogClose } from './Dialog'
export type { DialogProps, DialogContentProps } from './Dialog'

export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from './Tooltip'
export type { TooltipProps, TooltipProviderProps, TooltipContentProps } from './Tooltip'

export { POPPER_WRAPPER_ATTR, INERT_PLACEMENT } from './popper'
