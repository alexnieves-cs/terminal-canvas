import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'

/**
 * Central xterm factory. Every panel goes through here so theme, font metrics,
 * and renderer selection stay identical across the canvas - which matters from
 * M3, where a panel can swap between a live terminal and a static preview and
 * must not visibly change size when it does.
 */

// M45. The theme is a PARAMETER, defaulting to the light theme that bare
// :root carries — but the value that actually renders is whatever
// registry.applyTerminalOptions last fanned out, because session-factory.ts
// applies the accumulated options the moment the Terminal is built. This
// default only matters for a Terminal built before the first fan-out, which
// is the frame before useTheme's first read; terminal/themes.ts is where the
// two palettes live and why the light one is re-tuned rather than inverted.
import { LIGHT_TERMINAL_THEME } from './themes'

export interface TerminalHandles {
  term: Terminal
  fitAddon: FitAddon
  webgl: WebglAddon | null
  rendererKind: 'webgl' | 'dom'
  /** open() has been called once; it must never be called again. */
  opened: boolean
  /** Set when a context loss makes WebGL untrustworthy for this terminal. */
  webglDisabled: boolean
}

/**
 * Constructs a Terminal WITHOUT opening it. Attachment is separate because
 * open() measures font metrics against a laid-out node, so it cannot run while
 * the host is out of the document — and a panel that has never been on screen
 * has no size to be measured.
 */
export function createTerminal(theme: ITheme = LIGHT_TERMINAL_THEME): TerminalHandles {
  const term = new Terminal({
    theme,
    // The SAME list as the stylesheet's --font-mono, so a path in the
    // inspector and the same path in the terminal resolve to the same glyphs.
    // The pre-M45 list named JetBrains Mono, which the app does not ship and
    // which therefore fell through silently on every machine.
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
    fontSize: 13,
    lineHeight: 1.2,
    letterSpacing: 0,
    cursorBlink: true,
    // Agent TUIs redraw a lot; a generous scrollback costs little and makes
    // reading back through a long agent run practical.
    scrollback: 10_000,
    allowProposedApi: true,
    macOptionIsMeta: true
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  // M36 (backlog #43). Without this xterm measures character widths against
  // its built-in Unicode 6 table, and every emoji status glyph and post-6
  // box character an agent TUI draws is one column narrower than the shell
  // believes it is: the frame drifts one column per wide glyph and the
  // corruption compounds down the pane, in a way that reads as the TUI's own
  // fault. Loaded HERE, before open(), and never later: changing the width
  // table after the fact is a re-measure of every line already in the
  // buffer, which would need the refresh(0, rows - 1) treatment attachTerminal
  // carries for re-attach. Nothing about the grid changes — no resize, no
  // SIGWINCH — which is what makes this a one-line defect fix rather than
  // the resize-wearing-a-hat that a font change is. verify:xterm unicode.1.
  term.loadAddon(new Unicode11Addon())
  term.unicode.activeVersion = '11'
  return { term, fitAddon, webgl: null, rendererKind: 'dom', opened: false, webglDisabled: false }
}

/**
 * Puts a terminal on screen: open once, take a WebGL context, fit.
 * The host must already be in the document.
 */
export function attachTerminal(handles: TerminalHandles, host: HTMLElement): void {
  if (!handles.opened) {
    handles.term.open(host)
    handles.opened = true
  }

  if (!handles.webglDisabled && !handles.webgl) {
    // Browsers cap live WebGL contexts near 16, which is why lod.ts budgets
    // live panels at 8 and detachTerminal() gives the context back the moment a
    // panel is demoted. This DOM fallback is the last line of defence for the
    // case where a context is refused or lost anyway.
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => {
        // A lost context leaves the canvas blank. Drop it, and do not ask for
        // another on the next promotion — a terminal that has lost one context
        // tends to lose the next, and the DOM renderer at least draws.
        handles.webgl?.dispose()
        handles.webgl = null
        handles.webglDisabled = true
        handles.rendererKind = 'dom'
      })
      handles.term.loadAddon(webgl)
      handles.webgl = webgl
      handles.rendererKind = 'webgl'
    } catch (error) {
      console.warn('[terminal] WebGL renderer unavailable, using DOM renderer', error)
      handles.webglDisabled = true
      handles.rendererKind = 'dom'
    }
  }

  handles.fitAddon.fit()
  // Task 1 (spike) proved this is load-bearing: under WebGL a fresh context on
  // re-attach does not repaint on its own. Do not "optimise" this away.
  handles.term.refresh(0, handles.term.rows - 1)
}

/** Frees the WebGL context. The Terminal and its buffer survive untouched. */
export function detachTerminal(handles: TerminalHandles): void {
  handles.webgl?.dispose()
  handles.webgl = null
  handles.rendererKind = 'dom'
}

export function disposeTerminal(handles: TerminalHandles): void {
  handles.webgl?.dispose()
  handles.term.dispose()
}
