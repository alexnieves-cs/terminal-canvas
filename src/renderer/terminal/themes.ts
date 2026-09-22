import type { ITheme } from '@xterm/xterm'

/**
 * M45. The terminal follows the theme. Two ITheme values, one per
 * `data-theme`, and `terminalTheme()` picks by the resolved name useTheme
 * stamps — never by the setting's raw value, because `system` resolves to one
 * of these two and is not a theme of its own.
 *
 * DARK's sixteen ANSI entries are the pre-M45 set byte for byte (M109 moved
 * only the ground, with the stylesheet's --well): they are the
 * agent's palette, not the app's (tmux-args.ts sets terminal-features RGB so
 * 24-bit agent colour passes through undownsampled), and re-tuning them to
 * suit the chrome would be the app overruling the thing it exists to display.
 *
 * LIGHT is a light ground with dark text and a sixteen-colour set RE-TUNED
 * for that ground — the whole reason backlog #10 called a light theme "the
 * whole item": bright yellow on white is unreadable, so `yellow` and its
 * bright twin darken to an amber, `white` becomes a mid grey (it is what a
 * TUI paints as "dim text" and on a white ground the original would vanish),
 * and every accent drops in lightness until it clears the ground.
 *
 * `background` MUST match the stylesheet's --well for the same theme, or the
 * slot shows a seam against the terminal in the frame before xterm paints —
 * verify:panels theme.1 reads the card slot's computed background against it.
 */
export const DARK_TERMINAL_THEME: ITheme = {
  // M109. The Obsidian well: a half-step below the glass, --well in styles.css.
  background: '#0a0c10',
  foreground: '#d8dae5',
  cursor: '#5ec4d4',
  cursorAccent: '#0a0c10',
  selectionBackground: '#27414a',
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

export const LIGHT_TERMINAL_THEME: ITheme = {
  background: '#ffffff',
  foreground: '#1f2430',
  cursor: '#2f6bd8',
  cursorAccent: '#ffffff',
  selectionBackground: '#cfdcf7',
  black: '#1f2430',
  red: '#c8283e',
  green: '#2f7d32',
  yellow: '#9a6700',
  blue: '#2f6bd8',
  magenta: '#8250c8',
  cyan: '#0b7f97',
  white: '#6e7686',
  brightBlack: '#8b93a3',
  brightRed: '#d1465a',
  brightGreen: '#3c8f3f',
  brightYellow: '#a8720a',
  brightBlue: '#3b7be0',
  brightMagenta: '#9a63d8',
  brightCyan: '#1590aa',
  brightWhite: '#1f2430'
}

export type ResolvedTheme = 'light' | 'dark'

export function terminalTheme(resolved: ResolvedTheme): ITheme {
  return resolved === 'dark' ? DARK_TERMINAL_THEME : LIGHT_TERMINAL_THEME
}
