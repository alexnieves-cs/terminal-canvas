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
      // Deliberately NOT ensure(): a Terminal that has been constructed but
      // never opened reports xterm's 80x24 default, and this number is handed
      // straight to pty.create. That is exactly the fabricated grid "fit before
      // spawn" exists to prevent — and it would be silent, since 80x24 is a
      // perfectly plausible answer. Only attachSlot() calls this, and only
      // after attach(); anything else is a caller bug, so say so loudly.
      if (!handles) throw new Error(`panel ${id}: size() called before attach()`)
      return { cols: handles.term.cols, rows: handles.term.rows }
    },
    refit() {
      // Guarded rather than ensure()d, for the same reason size() is: a
      // Terminal that was never opened has no host box to fit against, and
      // constructing one here would only produce xterm's 80x24 default.
      if (handles) handles.fitAddon.fit()
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
    locate(word) {
      if (!handles) return null
      const { term } = handles
      const buffer = term.buffer.active
      // Search the VISIBLE rows and return a row index relative to the top of
      // the screen: a screen coordinate needs a screen row, not a buffer row.
      for (let row = 0; row < term.rows; row++) {
        const line = buffer.getLine(buffer.viewportY + row)
        if (!line) continue
        const col = line.translateToString(true).indexOf(word)
        if (col !== -1) return { col, row }
      }
      return null
    },
    cellSize() {
      if (!handles) return { width: 0, height: 0 }
      const { term } = handles
      const screen = term.element?.querySelector('.xterm-screen') as HTMLElement | null
      if (!screen) return { width: 0, height: 0 }
      // offsetWidth/offsetHeight are LAYOUT pixels — unaffected by an
      // ancestor's CSS transform, which is exactly the property needed here
      // and the same blindness xterm's own dimensions.css.cell.width has.
      // Deriving from the rendered screen rather than reading a private field
      // keeps this honest if the font metrics ever change.
      return {
        width: screen.offsetWidth / (term.cols || 1),
        height: screen.offsetHeight / (term.rows || 1)
      }
    },
    scrollPosition() {
      return handles?.term.buffer.active.viewportY ?? 0
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
