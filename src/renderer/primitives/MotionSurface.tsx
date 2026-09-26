import { motion, useReducedMotion } from 'motion/react'
import { MOTION_EASE, MOTION_SURFACE_MS } from '../motion'
import { isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ElementType, type ReactElement, type ReactNode } from 'react'

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

type AnyRef = ((node: unknown) => void) | { current: unknown } | null | undefined

/**
 * M345. What Radix hands a surface through `asChild` — its ref, its handlers,
 * its aria and data attributes — merged onto the child the way Radix's own
 * Slot merges: the child's props win, className joins, style merges, and a
 * handler both define runs the child's first, then Radix's.
 *
 * Before M345 every one of those was DROPPED here (this function took only
 * its four named props). The one that mattered most was the ref: Radix's
 * DismissableLayer judges "inside" by the node that ref points at, so with no
 * node, EVERY press inside a force-mounted menu read as outside it — a real
 * click on "Share this workspace…" closed the account menu on pointerdown and
 * its pointerup landed on the canvas, selecting nothing. Dispatched `.click()`s
 * (what every existing check used) never press, which is how it hid.
 */
function mergeSlot(slot: Record<string, unknown>, own: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...slot, ...own }
  for (const key of Object.keys(slot)) {
    const a = own[key], b = slot[key]
    if (/^on[A-Z]/.test(key) && typeof a === 'function' && typeof b === 'function') {
      out[key] = (...args: unknown[]) => { (a as (...x: unknown[]) => unknown)(...args); (b as (...x: unknown[]) => unknown)(...args) }
    } else if (key === 'className' && typeof a === 'string' && typeof b === 'string') {
      out[key] = `${b} ${a}`
    } else if (key === 'style' && typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      out[key] = { ...(b as object), ...(a as object) }
    }
  }
  return out
}

function assignRef(ref: AnyRef, node: unknown): void {
  if (typeof ref === 'function') ref(node)
  else if (ref !== null && ref !== undefined) (ref as { current: unknown }).current = node
}

export function MotionSurface({ open, enter = false, onExitComplete, children, ...slot }: MotionSurfaceProps & Record<string, unknown>): ReactElement {
  if (!isValidElement(children)) throw new Error('a MotionSurface needs one element child')
  const child = children as ReactElement<Record<string, unknown>>
  const { ref: slotRef, ...slotProps } = slot as { ref?: AnyRef } & Record<string, unknown>
  const merged = mergeSlot(slotProps, child.props)
  // ONE callback for the element's life. Radix composes a fresh ref callback on
  // every render, and handing React a new ref each render makes it detach
  // (null) and re-attach the node every commit — behind Radix's
  // `setContent(node)` that is a render loop that froze the renderer
  // (verify:panels:product hung in work.action.1's reload). So the element
  // gets a stable callback that writes the node to whatever refs are current,
  // and a changed ref is handed the existing node in the layout pass — the
  // same node, so a setState behind it bails out instead of looping.
  const childRef = child.props['ref'] as AnyRef
  const nodeRef = useRef<unknown>(null)
  const latest = useRef<AnyRef[]>([slotRef, childRef])
  latest.current = [slotRef, childRef]
  const ref = useCallback((node: unknown) => { nodeRef.current = node; for (const r of latest.current) assignRef(r, node) }, [])
  useLayoutEffect(() => { if (nodeRef.current !== null) { assignRef(slotRef, nodeRef.current); assignRef(childRef, nodeRef.current) } }, [slotRef, childRef])
  const MotionElement = useMemo(() => elementFor(child.type as ElementType), [child.type])
  const reduced = useReducedMotion()
  const [visible, setVisible] = useState(open)

  useEffect(() => {
    if (open) setVisible(true)
  }, [open])

  // Brief #21. An overlay arriving or leaving is the SURFACE tier, on the
  // stylesheet's own curve — it was 140ms on a curve of its own.
  const transition = reduced ? { duration: 0 } : { duration: MOTION_SURFACE_MS / 1000, ease: MOTION_EASE }
  return (
    <MotionElement
      {...merged}
      ref={ref}
      initial={enter && !reduced ? { opacity: 0, y: 4, scale: 0.985 } : false}
      animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -4, scale: 0.985 }}
      transition={transition}
      // A closing layer must not catch a click while it is on its way out.
      // Open, the layer's own value stands: a modal Radix layer turns the BODY's
      // pointer events off and its content's back on (`auto`) through this style,
      // and overwriting it with undefined left the share dialog visible and
      // unclickable (M345's probe: body none, card none).
      style={{ ...((merged['style'] as object | undefined) ?? {}), pointerEvents: open ? (merged['style'] as { pointerEvents?: string } | undefined)?.pointerEvents : 'none' }}
      aria-hidden={open ? merged['aria-hidden'] : true}
      hidden={!visible}
      onAnimationComplete={() => { if (!open) { setVisible(false); onExitComplete?.() } }}
    />
  )
}
