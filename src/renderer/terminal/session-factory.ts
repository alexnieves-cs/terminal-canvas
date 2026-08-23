import type { PanelId } from '@shared/types'
import type { SessionFactory, SessionHandle } from '@renderer/session/panel-session'
import {
  attachTerminal,
  createTerminal,
  detachTerminal,
  disposeTerminal,
  type TerminalHandles
} from './create-terminal'

/**
 * The real SessionHandle: xterm behind the interface the registry sees.
 *
 * The host div is created once, detached, and reused forever. Tiering moves
 * this node in and out of the document; it never recreates it, because
 * term.open() is not repeatable and everything xterm has drawn lives inside.
 */
function createHandle(id: PanelId): SessionHandle {
  const host = document.createElement('div')
  host.className = 'panel__terminal'
  host.dataset.panelId = id

  let handles: TerminalHandles | null = null

  const ensure = (): TerminalHandles => {
    if (!handles) handles = createTerminal()
    return handles
  }

  return {
    host,
    attach() {
      const h = ensure()
      // The caller has already put host into the document; open() measures it.
      attachTerminal(h, host)
    },
    detach() {
      if (handles) detachTerminal(handles)
      host.remove()
    },
    write(data) {
      ensure().term.write(data)
    },
    size() {
      const h = ensure()
      return { cols: h.term.cols, rows: h.term.rows }
    },
    tail(lines) {
      if (!handles) return []
      // Read xterm's own parsed grid rather than keeping a second copy of every
      // byte and hand-rolling an ANSI stripper.
      const buffer = handles.term.buffer.active
      const out: string[] = []
      for (let i = buffer.length - 1; i >= 0 && out.length < lines; i--) {
        const text = buffer.getLine(i)?.translateToString(true).trim()
        if (text) out.unshift(text)
      }
      return out
    },
    focus() {
      handles?.term.focus()
    },
    onInput(listener) {
      ensure().term.onData(listener)
    },
    getSelection() {
      return handles?.term.getSelection() ?? ''
    },
    paste(data) {
      // term.paste, not a raw pty.write: xterm wraps the payload in
      // bracketed-paste markers when the app has enabled them, and
      // normalises CRLF/LF to CR. Writing raw makes every newline in a
      // multi-line prompt submit as a separate Enter, so pasting a prompt
      // into `claude` fires off several partial prompts instead of one.
      ensure().term.paste(data)
    },
    dispose() {
      if (handles) disposeTerminal(handles)
      handles = null
      host.remove()
    }
  }
}

export function createSessionFactory(): SessionFactory {
  return { create: createHandle }
}
