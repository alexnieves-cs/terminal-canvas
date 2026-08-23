import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

/**
 * Central xterm factory. Every panel goes through here so theme, font metrics,
 * and renderer selection stay identical across the canvas - which matters from
 * M3, where a panel can swap between a live terminal and a static preview and
 * must not visibly change size when it does.
 */

const theme: ITheme = {
  background: '#12131a',
  foreground: '#d8dae5',
  cursor: '#7aa2f7',
  cursorAccent: '#12131a',
  selectionBackground: '#2d3350',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#ff7a93',
  brightGreen: '#b9f27c',
  brightYellow: '#ff9e64',
  brightBlue: '#7da6ff',
  brightMagenta: '#bb9af7',
  brightCyan: '#0db9d7',
  brightWhite: '#c0caf5'
}

export interface TerminalHandles {
  term: Terminal
  fitAddon: FitAddon
  /** Which renderer we actually ended up with; surfaced for the status bar. */
  rendererKind: 'webgl' | 'dom'
  dispose(): void
}

export function createTerminal(container: HTMLElement): TerminalHandles {
  const term = new Terminal({
    theme,
    fontFamily: '"SF Mono", "JetBrains Mono", Menlo, Monaco, monospace',
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
  term.open(container)

  let rendererKind: TerminalHandles['rendererKind'] = 'dom'
  let webgl: WebglAddon | null = null

  // Browsers cap live WebGL contexts near 16. In M1 there is exactly one panel,
  // but the fallback path is wired now so M3's context pooling is a swap rather
  // than a rewrite.
  try {
    webgl = new WebglAddon()
    webgl.onContextLoss(() => {
      // A lost context leaves the canvas blank. Drop the addon and let xterm
      // fall back to DOM rendering rather than showing an empty panel.
      webgl?.dispose()
      webgl = null
      rendererKind = 'dom'
    })
    term.loadAddon(webgl)
    rendererKind = 'webgl'
  } catch (error) {
    console.warn('[terminal] WebGL renderer unavailable, using DOM renderer', error)
    webgl = null
  }

  return {
    term,
    fitAddon,
    rendererKind,
    dispose() {
      webgl?.dispose()
      term.dispose()
    }
  }
}
