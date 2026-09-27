import { motion, useReducedMotion } from 'motion/react'
import { isValidElement, useCallback, useEffect, useMemo, useState, type ComponentType, type ElementType, type ReactElement, type ReactNode } from 'react'

/**
 * Keeps Radix responsible for the overlay lifecycle while Motion owns the
 * paint between its open and closed states.  `forceMount` is intentional:
 * Radix otherwise removes a surface before an exit can be seen.  The element
 * is made hidden only after Motion has finished its short departure, so
 * force-mounted controls remain addressable by the existing harness.
 */
const motionElements = new Map<ElementType, ComponentType<Record<string, unknown>>>()

function elementFor(type: ElementType): ComponentType<Record<string, unknown>> {
  const known = motionElements.get(type)
  if (known !== undefined) return known
  const created = motion.create(type) as ComponentType<Record<string, unknown>>
  motionElements.set(type, created)
  return created
}

export interface MotionSurfaceProps {
  readonly open: boolean
  readonly enter?: boolean
  readonly onExitComplete?: () => void
  readonly children: ReactNode
}

type Props = Record<string, unknown>
type AnyRef = ((node: unknown) => void) | { current: unknown } | null | undefined

/**
 * Radix's Slot semantics, applied a second time. Every primitive renders
 * `<Radix.X.Content asChild>` around this surface, so the Slot's props — the
 * ref, the DismissableLayer's onFocusCapture/onBlurCapture/onPointerDownCapture,
 * FocusScope's and the roving group's onKeyDown, role, id, data-state, aria-* —
 * arrive HERE, not on the child. Dropping them (M276 did) throws nothing: the
 * layer simply never learns a focus was inside, reads every Tab as leaving,
 * and dismisses a popover one step in (reach.1). So they are merged exactly
 * as Radix merges them: handlers composed child-first, style and className
 * combined, the child winning any other collision, both refs kept.
 */
function mergeSlotProps(slot: Props, child: Props): Props {
  const merged: Props = { ...slot, ...child }
  for (const key of Object.keys(slot)) {
    const s = slot[key], c = child[key]
    if (/^on[A-Z]/.test(key) && typeof s === 'function' && typeof c === 'function') {
      merged[key] = (...args: unknown[]): unknown => { const r = (c as (...a: unknown[]) => unknown)(...args); (s as (...a: unknown[]) => unknown)(...args); return r }
    } else if (/^on[A-Z]/.test(key) && typeof s === 'function' && c === undefined) {
      // A child's `onKeyDown={undefined}` must not erase the Slot's handler —
      // Radix keeps the slot's (react-slot's `else if (slotPropValue)`), and
      // losing it is this function's whole failure, arriving silently.
      merged[key] = s
    } else if (key === 'style' && s !== undefined && c !== undefined) merged.style = { ...(s as object), ...(c as object) }
    else if (key === 'className' && s !== undefined && c !== undefined) merged.className = [s, c].filter(Boolean).join(' ')
  }
  // Both refs are composed by the caller (useComposedRef), so it is stable across renders.
  delete merged.ref
  return merged
}

/**
 * Both refs kept, as ONE stable callback: a fresh composed function every
 * render makes React detach (null) and re-attach the node each commit, which
 * churns Radix's own content ref for nothing.
 */
function useComposedRef(a: AnyRef, b: AnyRef): AnyRef {
  return useCallback((node: unknown): void => {
    for (const r of [a, b]) { if (typeof r === 'function') r(node); else if (r) r.current = node }
  }, [a, b])
}

export function MotionSurface({ open, enter = false, onExitComplete, children, ...slot }: MotionSurfaceProps & Props): ReactElement {
  if (!isValidElement(children)) throw new Error('a MotionSurface needs one element child')
  const child = children as ReactElement<Props>
  const props = mergeSlotProps(slot, child.props)
  const ref = useComposedRef(slot.ref as AnyRef, child.props.ref as AnyRef)
  const MotionElement = useMemo(() => elementFor(child.type as ElementType), [child.type])
  const reduced = useReducedMotion()
  const [visible, setVisible] = useState(open)

  useEffect(() => {
    if (open) setVisible(true)
  }, [open])

  const transition = reduced ? { duration: 0 } : { duration: 0.14, ease: [0.22, 1, 0.36, 1] }
  return (
    <MotionElement
      {...props}
      ref={ref}
      initial={enter && !reduced ? { opacity: 0, y: 4, scale: 0.985 } : false}
      animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -4, scale: 0.985 }}
      transition={transition}
      // A closing layer must not catch a click while it is on its way out.
      style={{ ...((props.style as object | undefined) ?? {}), pointerEvents: open ? undefined : 'none' }}
      aria-hidden={open ? props['aria-hidden'] : true}
      hidden={!visible}
      onAnimationComplete={() => { if (!open) { setVisible(false); onExitComplete?.() } }}
    />
  )
}
