/**
 * M339. A Y.Text bound to a plain string held somewhere else — FileNode's
 * draft while a note is in RICH mode, where there is no Monaco model for
 * y-monaco to bind.
 *
 * yjs only (no y-monaco, no DOM), so verify:canvas-sync drives it over two
 * real docs in node. Reached only through binding.ts, inside the lazily
 * imported shared-text chunk (text.door.1/.2).
 *
 * The contract is two directions and no echo:
 *  - `push(next)` writes a LOCAL change as one minimal edit (common prefix and
 *    suffix kept), so a peer's caret outside the change stays put;
 *  - any change this binding did not push — a peer's, arriving through main —
 *    is handed to `set` as the whole new text.
 * A pushed value never comes back through `set`, and a value `set` delivered
 * pushes back as a no-op, because the texts are already equal.
 *
 * The race a value binding has and y-monaco does not: a peer's update can land
 * after the caller computed its change but before `push` — the commit was made
 * on the OLDER text. Diffing that commit against the current text would undo
 * the peer's change (verify:canvas-sync text.value.2 reproduces it: the
 * harness relays synchronously). So `push` takes the text the change was
 * computed on, `base`, and when the shared text has moved since, rebases:
 * both changes are single regions of `base`; disjoint regions both survive,
 * and overlapping ones (the same block edited on both sides) resolve to the
 * local edit over their union — last writer wins at block grain, the rule the
 * canvas's field maps already follow.
 */
import * as Y from 'yjs'

/** Our own pushes, so the observer can tell them from a peer's. */
const LOCAL = Symbol('shared-text:value')

/** The one region that turns `a` into `b`: `a[start, a.length - end)` becomes `insert` (common prefix and suffix kept). */
export function region(a: string, b: string): { start: number; end: number; insert: string } {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  return { start, end, insert: b.slice(start, b.length - end) }
}

function replace(ytext: Y.Text, from: number, to: number, insert: string, origin: unknown): void {
  const apply = (): void => {
    if (to > from) ytext.delete(from, to - from)
    if (insert !== '') ytext.insert(from, insert)
  }
  if (ytext.doc === null) apply()
  else ytext.doc.transact(apply, origin)
}

/** Replace `ytext`'s content with `next` as ONE minimal edit — common prefix and suffix kept. */
export function setText(ytext: Y.Text, next: string, origin: unknown = null): void {
  const cur = ytext.toString()
  if (cur === next) return
  const r = region(cur, next)
  replace(ytext, r.start, cur.length - r.end, r.insert, origin)
}

/**
 * Write the change `base → next` into `ytext`, which may have moved on from
 * `base` (a peer's change arrived meanwhile). See the header for the rule.
 */
export function rebaseText(ytext: Y.Text, base: string, next: string, origin: unknown = null): void {
  const cur = ytext.toString()
  if (cur === base) { setText(ytext, next, origin); return }
  if (base === next) return
  const l = region(base, next), r = region(base, cur)
  const lEnd = base.length - l.end, rEnd = base.length - r.end
  const shift = r.insert.length - (rEnd - r.start)
  // Theirs is wholly after ours (an insertion at the same point counts as
  // after, so ours lands first): our coordinates are unchanged.
  if (lEnd <= r.start && !(lEnd === r.start && l.start === lEnd && r.start === rEnd && l.insert === '')) {
    replace(ytext, l.start, lEnd, l.insert, origin)
    return
  }
  if (l.start >= rEnd) { replace(ytext, l.start + shift, lEnd + shift, l.insert, origin); return }
  // Overlap: the union of both regions, as OURS has it.
  const from = Math.min(l.start, r.start)
  const toBase = Math.max(lEnd, rEnd)
  const toCur = toBase === lEnd && lEnd > rEnd ? lEnd + shift : rEnd + shift
  replace(ytext, from, toCur, next.slice(from, toBase + (next.length - base.length)), origin)
}

export interface ValueBinding {
  /**
   * A local change: written into the shared text (a viewer's is dropped).
   * `base` is the text the change was computed on; omitted, the change is
   * taken to be on the current text.
   */
  push(next: string, base?: string): void
  /** The owner's discard: the shared text goes back to `text` for everyone. */
  revert(text: string): void
  dispose(): void
}

export function bindValue(ytext: Y.Text, set: (text: string) => void, readOnly: boolean): ValueBinding {
  let disposed = false
  const observer = (_event: Y.YTextEvent, tr: Y.Transaction): void => {
    if (disposed || tr.origin === LOCAL) return
    set(ytext.toString())
  }
  ytext.observe(observer)
  return {
    push(next, base) {
      if (disposed || readOnly) return
      if (base === undefined) setText(ytext, next, LOCAL)
      else {
        rebaseText(ytext, base, next, LOCAL)
        // Rebased over a change the caller had not seen: the result is neither
        // `next` nor what the caller last heard, so it is told.
        if (ytext.toString() !== next) set(ytext.toString())
      }
    },
    // A revert is a LOCAL change too, but the editor showing the draft is being
    // closed by the same gesture, so it goes out with the observer's origin
    // left alone: a still-mounted editor is told the text it now holds.
    revert(text) { if (!disposed && !readOnly) setText(ytext, text) },
    dispose() {
      if (disposed) return
      disposed = true
      ytext.unobserve(observer)
    }
  }
}
