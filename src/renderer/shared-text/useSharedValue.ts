import { useEffect, useRef, type MutableRefObject } from 'react'
import type { SharedTextTarget } from './target'

/**
 * M339. Rich mode's door onto shared text: while `target` is set, the
 * caller's draft string is bound to the shared file's Y.Text (binding.ts
 * `bindSharedValue`), the way CodeEditor binds Monaco's model in Source mode.
 * Before M339 a Rich edit reached the shared text only when its author went
 * back to Source, and then won over everything a teammate had typed since.
 *
 * yjs-free: the binding is `import()`ed lazily, so a note that is never shared
 * never loads the shared-text chunk (text.door.2).
 *
 * Returns `push(next, base)`, which the caller invokes SYNCHRONOUSLY from its
 * change handler with the text the change was computed on — not from an
 * effect on `value`, whose render-to-effect gap would let a peer's update land
 * between the two and be written back over. `base` lets value.ts rebase a
 * commit made on a text a peer has since changed.
 */
export function useSharedValue(
  target: SharedTextTarget | null,
  value: string | null,
  apply: (text: string) => void,
  onState: (state: string | null) => void,
  revertRef: MutableRefObject<((text: string) => void) | null>
): (next: string, base: string) => void {
  const valueRef = useRef(value); valueRef.current = value
  const applyRef = useRef(apply); applyRef.current = apply
  const stateRef = useRef(onState); stateRef.current = onState
  const targetRef = useRef(target); targetRef.current = target
  const pushRef = useRef<((next: string, base: string) => void) | null>(null)
  const key = target === null ? null : `${target.workspaceId}\u0000${target.panelId}`

  useEffect(() => {
    const t = targetRef.current
    if (key === null || t === null) return
    let cancelled = false
    let binding: { push(next: string, base?: string): void; revert(text: string): void; dispose(): void } | null = null
    void import('./binding').then(({ bindSharedValue }) => {
      if (cancelled) return
      const b = bindSharedValue(t, () => valueRef.current ?? '', (text) => { applyRef.current(text) }, (s) => { stateRef.current(s) })
      binding = b
      pushRef.current = (next, base) => { b.push(next, base) }
      revertRef.current = (text) => { b.revert(text) }
    })
    return () => {
      cancelled = true
      pushRef.current = null
      if (binding !== null) { revertRef.current = null; binding.dispose() }
      stateRef.current(null)
    }
    // `key` names the target; the ref carries the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (next, base) => { pushRef.current?.(next, base) }
}
