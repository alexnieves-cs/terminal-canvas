import { findLinks } from '@shared/link-scan'
import type { PanelId } from '@shared/types'
import type { SessionFactory, SessionHandle, TerminalOptions } from '@renderer/session/panel-session'
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
  // M52. The shell's prompt marks, for navigation and "copy last output".
  const prompts: import('@xterm/xterm').IMarker[] = []
  let commandMarker: import('@xterm/xterm').IMarker | null = null
  let lastCommand: import('@xterm/xterm').IMarker | null = null
  let lastEnd: import('@xterm/xterm').IMarker | null = null

  // M44. Options set through configure() BEFORE the terminal is created — a
  // carded panel that has never gone live. Applied when createTerminal first
  // runs, so configure never forces an early Terminal (and its addons) into
  // existence just to set a font size.
  let pendingOptions: TerminalOptions = {}

  const ensure = (): TerminalHandles => {
    if (!handles) {
      handles = createTerminal()
      if (Object.keys(pendingOptions).length > 0) Object.assign(handles.term.options, pendingOptions)
      // M51. Paths and URLs in the buffer become links: underlined on hover,
      // opened on Cmd-click ONLY (a plain click stays a click — agent TUIs
      // use clicks), and never by this process: the renderer sends the text
      // it underlined and the panel it came from, and main decides and
      // opens (link:open). The hover writes `data-link-hover` on the host,
      // which is what verify:panels hover.1 reads to prove the corrected
      // hover landed on the cell it meant.
      const term = handles.term
      // M52. OSC 133 marks — emitted by the shell main decorated, never by
      // this app's own bytes. A marker per prompt (A), the command's own
      // marker at C, and on D a decoration on it: a gutter rib, --ok or
      // --fail by exit status. Markers and decorations only: no text is kept
      // here and nothing bumps registry.version(); the ledger row is main's.
      term.parser.registerOscHandler(133, (data) => {
        const kind = data[0]
        const payload = data.length > 1 && data[1] === ';' ? data.slice(2) : ''
        if (kind === 'A') {
          const m = term.registerMarker(0)
          if (m) prompts.push(m)
          return true
        }
        if (kind === 'C') { commandMarker = term.registerMarker(0) ?? null; return true }
        if (kind === 'D') {
          const at = commandMarker ?? prompts[prompts.length - 1]
          const exit = payload === '' ? null : Number(payload)
          if (at && !at.isDisposed) {
            const dec = term.registerDecoration({ marker: at, x: 0, width: 1, layer: 'top' })
            dec?.onRender((el) => {
              el.classList.add('cmd-mark', exit === 0 ? 'cmd-mark--ok' : 'cmd-mark--fail')
              el.dataset['cmdExit'] = exit === null ? '' : String(exit)
              el.title = exit === 0 ? 'exit 0' : `exit ${exit ?? '?'}`
            })
          }
          lastEnd = term.registerMarker(0) ?? null
          lastCommand = commandMarker
          commandMarker = null
          return true
        }
        return true
      })
      term.registerLinkProvider({
        provideLinks(y, callback) {
          const line = term.buffer.active.getLine(y - 1)
          if (!line) { callback(undefined); return }
          const text = line.translateToString(true)
          const found = findLinks(text)
          if (found.length === 0) { callback(undefined); return }
          callback(found.map((l) => ({
            range: { start: { x: l.start + 1, y }, end: { x: l.end, y } },
            text: l.text,
            decorations: { underline: true, pointerCursor: true },
            activate(event: MouseEvent, target: string) {
              if (!event.metaKey) return
              void window.canvas.links.open({ panelId: id, target })
            },
            hover() { host.dataset['linkHover'] = l.text },
            leave() { delete host.dataset['linkHover'] }
          })))
        }
      })
    }
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
      //
      // M63 (backlog #53, rewritten down): ROWS AS ROWS. The last `lines`
      // rows of the VIEWPORT, interior blank rows kept and only the trailing
      // blank rows trimmed — so a full-screen TUI's card shows the bottom of
      // its real screen with its layout intact, rather than six non-empty
      // fragments of a box frame gathered from wherever they were. Right-
      // trimmed only: leading spaces are the layout.
      const buffer = handles.term.buffer.active
      const rowAt = (i: number): string => buffer.getLine(i)?.translateToString(true).replace(/\s+$/, '') ?? ''
      // Anchor on the LAST NON-EMPTY row (a shell's prompt sits above a
      // screenful of blank rows; a TUI's bottom border is its last row), then
      // take `lines` rows upward from it, blanks included.
      let bottom = buffer.length - 1
      while (bottom >= 0 && rowAt(bottom) === '') bottom -= 1
      const rows: string[] = []
      for (let i = bottom; i >= 0 && rows.length < lines; i--) rows.unshift(rowAt(i))
      return rows
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
    configure(options) {
      // Object.assign onto term.options is xterm's supported mutate path and
      // works before open() (the options live on the Terminal, not the DOM) —
      // but do NOT ensure(): a carded panel that never went live must not get
      // a Terminal built just to configure it. Merge into pending and apply
      // live only if the terminal already exists.
      Object.assign(pendingOptions, options)
      if (handles) {
        Object.assign(handles.term.options, options)
        // M45. A theme change on an OPENED terminal repaints explicitly, the
        // same refresh(0, rows - 1) attachTerminal carries for a re-attach:
        // under WebGL the option setter re-derives the palette but a fresh
        // paint of every row is what makes the old colours actually leave
        // the screen. A never-opened terminal has nothing to repaint and
        // paints in the new theme on its first attach.
        if ('theme' in options && handles.opened) handles.term.refresh(0, handles.term.rows - 1)
      }
    },
    options() {
      return { ...pendingOptions }
    },
    jumpPrompt(direction) {
      if (!handles) return false
      const term = handles.term
      const top = term.buffer.active.viewportY
      const live = prompts.filter((m) => !m.isDisposed).map((m) => m.line)
      const target = direction < 0
        ? live.filter((l) => l < top).pop()
        : live.find((l) => l > top)
      if (target === undefined) return false
      term.scrollToLine(target)
      return true
    },
    lastCommandOutput() {
      if (!handles || !lastCommand || !lastEnd || lastCommand.isDisposed || lastEnd.isDisposed) return null
      const buf = handles.term.buffer.active
      const lines: string[] = []
      for (let y = lastCommand.line + 1; y < lastEnd.line; y += 1) {
        const line = buf.getLine(y)
        if (line) lines.push(line.translateToString(true))
      }
      return lines.join('\n')
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
