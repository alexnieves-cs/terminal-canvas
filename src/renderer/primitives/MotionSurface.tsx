import { motion, useReducedMotion } from 'motion/react'
import { isValidElement, useEffect, useMemo, useState, type ComponentType, type ElementType, type ReactElement, type ReactNode } from 'react'

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

export function MotionSurface({ open, enter = false, onExitComplete, children }: MotionSurfaceProps): ReactElement {
  if (!isValidElement(children)) throw new Error('a MotionSurface needs one element child')
  const child = children as ReactElement<Record<string, unknown>>
  const MotionElement = useMemo(() => elementFor(child.type as ElementType), [child.type])
  const reduced = useReducedMotion()
  const [visible, setVisible] = useState(open)

  useEffect(() => {
    if (open) setVisible(true)
  }, [open])

  const transition = reduced ? { duration: 0 } : { duration: 0.14, ease: [0.22, 1, 0.36, 1] }
  return (
    <MotionElement
      {...child.props}
      initial={enter && !reduced ? { opacity: 0, y: 4, scale: 0.985 } : false}
      animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -4, scale: 0.985 }}
      transition={transition}
      // A closing layer must not catch a click while it is on its way out.
      style={{ ...((child.props.style as object | undefined) ?? {}), pointerEvents: open ? undefined : 'none' }}
      aria-hidden={open ? child.props['aria-hidden'] : true}
      hidden={!visible}
      onAnimationComplete={() => { if (!open) { setVisible(false); onExitComplete?.() } }}
    />
  )
}
