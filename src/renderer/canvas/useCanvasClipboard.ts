import { existingRelayTerminal } from '@renderer/relay/RelayTerminal'
import { useEffect, useRef, type RefObject } from 'react'
import type { Registry } from '@renderer/session/session-registry'
import { isChatPanel, type Panel } from '@renderer/panels/panels'
import { shellQuote } from '@renderer/shell/file-tree-model'
import { REASON_NOT_STARTED } from '@renderer/palette/commands'
import { serveDraftEdit } from './draft-focus'

export interface CanvasClipboardDeps {
  registry: Registry
  focusedIdRef: RefObject<string | null>
  panelsRef: RefObject<Panel[]>
  shouldIgnoreKeys: () => boolean
  /**
   * This ref is declared later in Canvas because its writer is lower in the
   * component. Reading it lazily preserves that hook order while letting an
   * empty-canvas image paste reach the one image-minting verb.
   */
  getAddImage: () => ((path: string, world?: { x: number; y: number }) => Promise<unknown>) | null
  /**
   * M390/M391. The canvas's authored objects: `copy` holds the selection's
   * shapes, notes and pictures (true when it did); `paste` places a held copy
   * when the clipboard carries its marker, or imports pasted Mermaid (true
   * when either happened). Read lazily, like getAddImage.
   */
  getObjects?: () => { copy: () => boolean; paste: (text: string) => boolean } | null
}

/**
 * The canvas-wide Cmd+C/Cmd+V route.
 *
 * This replaces the contiguous ref-plus-effect run in `Canvas.tsx` without
 * moving it: `focusedIdRef` is created above this call while `addImageRef` is
 * assigned below it. The latter is read through `getAddImage` only after an
 * edit event arrives, after Canvas has completed its render and assignment.
 *
 * TerminalPanel is deliberately a view, so this is ONE subscription rather
 * than one per mounted terminal. The current focus comes from a ref for the
 * same reason: resubscribing on every focus change would create listener
 * churn around main-side menu accelerators.
 */
export function useCanvasClipboard(deps: CanvasClipboardDeps): RefObject<(sentence: string) => void> {
  const { registry, focusedIdRef, panelsRef, shouldIgnoreKeys, getAddImage, getObjects } = deps
  // M149. The palette action object is assigned after this hook's call, so a
  // refusal on paste is said rather than swallowed.
  const sayRef = useRef<(sentence: string) => void>(() => {})

  useEffect(() => {
    const offCopy = window.canvas.edit.onCopy(() => {
      // With the palette open the user is looking at a text field, not a
      // terminal, and focusedId still names that terminal (rule 2 keeps it).
      // Copying its selection here would put text the user cannot see on the
      // clipboard; Palette.tsx serves its own input instead. shouldIgnoreKeys
      // rather than palette.isOpen because the nav grid is the SAME
      // situation and a worse one: revealing it means the user is already
      // holding Cmd, which makes a stray Cmd+C the most plausible chord in
      // the app, aimed at a selection an opaque overlay is covering.
      if (shouldIgnoreKeys()) return
      // A text draft has the keyboard: its selection, not the terminal's.
      if (serveDraftEdit('copy')) return
      const id = focusedIdRef.current
      // M390. No panel has the keyboard and objects are selected: the copy is
      // the canvas's (an in-app clipboard; the system one gets a marker).
      if (id === null && getObjects?.()?.copy() === true) return
      // M338. A relay terminal's xterm is not in the registry — its pty is remote.
      const relay = id === null ? undefined : existingRelayTerminal(id)
      if (relay !== undefined) { const chosen = relay.getSelection(); if (chosen) void navigator.clipboard.writeText(chosen); return }
      const session = id ? registry.get(id) : undefined
      const selection = session?.handle.getSelection()
      if (selection) void navigator.clipboard.writeText(selection)
    })
    const offPaste = window.canvas.edit.onPaste((text) => {
      // Rule 3. Without this the text lands in a running agent, invisibly,
      // while the user watches an empty text field (palette, verify:panels
      // 35) or an opaque grid overlay (nav grid) — and in the grid's case the
      // switch that follows on release takes the evidence off screen.
      if (shouldIgnoreKeys()) return
      // A text draft has the keyboard (draft-focus.ts): the paste is the
      // field's, never the running agent's behind it.
      if (serveDraftEdit('paste', text)) return
      const id = focusedIdRef.current
      // M390/M391. No panel has the keyboard: a held copy of objects, or a
      // Mermaid diagram as text, lands on the canvas (inert — shapes only).
      if (id === null && text && getObjects?.()?.paste(text) === true) return
      // M338. Into a relay terminal only as TEXT, through its own gate; an
      // image path would name a file on this Mac that the relay VM cannot read.
      const relay = id === null ? undefined : existingRelayTerminal(id)
      if (relay !== undefined) { if (text) relay.paste(text); return }
      const session = id ? registry.get(id) : undefined
      if (text) { session?.handle.paste(text); return }
      // M145 (backlog #13's bytes case). No TEXT on the clipboard: an image
      // there becomes a file main writes, and a spawned terminal is handed the
      // path — shell-quoted, bracketed, the drop's own rule — while a chat
      // attaches it through its composer. A terminal that is not spawned gets
      // nothing (a paste into a dormant card has nowhere to land), and an
      // empty clipboard is the `empty` arm, not a paste of nothing.
      // M186. NO PANEL HAS THE KEYBOARD: the picture is the canvas's. This is
      // the arm that did not exist — the paste simply returned, so ⌘V over an
      // empty canvas did nothing and said nothing. Every agent target below
      // keeps its behaviour exactly.
      if (id === null) {
        void window.canvas.agentSession.clipboardFile().then((file) => {
          if (file.kind === 'empty') return
          if (file.kind !== 'ok') { sayRef.current(`the image could not be written — ${file.why}`); return }
          void getAddImage()?.(file.path)
        })
        return
      }
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      // A chat keeps its OWN door: ChatNode subscribes to this same event and
      // attaches the clipboard's bytes when its textarea is focused. The first
      // cut attached a path here too — one ⌘V, two attachments and a .png the
      // chat never needed (the Act II critic's Major).
      if (panel !== undefined && isChatPanel(panel)) return
      if (session === undefined || !session.spawned) {
        // Named, never silent: a paste into a card has nowhere to land.
        sayRef.current(`${REASON_NOT_STARTED} — an image pasted here has no process to receive it`)
        return
      }
      void window.canvas.agentSession.clipboardFile().then((file) => {
        if (file.kind === 'empty') return
        if (file.kind !== 'ok') { sayRef.current(`the image could not be written — ${file.why}`); return }
        registry.get(id)?.handle.paste(shellQuote(file.path))
      })
    })
    return () => {
      offCopy()
      offPaste()
    }
    // shouldIgnoreKeys is referentially stable, so this stays a once-only
    // install; listing it makes the dependency visible rather than implied.
    // getAddImage deliberately stays out: its call reads the current ref and
    // including Canvas's fresh closure would reinstall both subscriptions.
  }, [shouldIgnoreKeys])

  return sayRef
}
